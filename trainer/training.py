"""TRL-based training runs: SFT, DPO, GRPO with LoRA/QLoRA (spec §13.2–13.5)."""
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import trainer_db
from hardware import detect_hardware

logger = logging.getLogger(__name__)

HF_MODEL_ID = os.getenv("HF_MODEL_ID", "Qwen/Qwen3-8B")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "storage:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "recruiterrag")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "recruiterrag")
ADAPTER_BUCKET = os.getenv("ADAPTER_OUTPUT_BUCKET", "model-adapters")
MODELS_DIR = Path("/models")
CONVERT_SCRIPT = "/opt/llama.cpp/convert_lora_to_gguf.py"


def _build_dataset(method: str, examples: list[dict], tokenizer):
    from datasets import Dataset

    if method == "sft":
        rows = []
        for e in examples:
            completion = e.get("chosen_response") or ""
            if e.get("cot_trace"):
                completion = f"<think>\n{e['cot_trace']}\n</think>\n{completion}"
            if e.get("prompt") and completion:
                rows.append({"prompt": e["prompt"], "completion": completion})
        return Dataset.from_list(rows)

    if method == "dpo":
        rows = [
            {"prompt": e["prompt"], "chosen": e["chosen_response"], "rejected": e["rejected_response"]}
            for e in examples
            if e.get("chosen_response") and e.get("rejected_response")
        ]
        return Dataset.from_list(rows)

    if method == "grpo":
        return Dataset.from_list([{"prompt": e["prompt"]} for e in examples if e.get("prompt")])

    raise ValueError(f"unknown method {method}")


def _grpo_reward_funcs(examples: list[dict]):
    """Rubric-based proxy reward (spec §13.4.2): rewards complete, structured reasoning."""
    dimension_words = set()
    for e in examples:
        for word in (e.get("prompt") or "").split():
            if word.istitle():
                dimension_words.add(word.lower())

    def reasoning_reward(completions, **kwargs):
        rewards = []
        for completion in completions:
            text = completion if isinstance(completion, str) else str(completion)
            score = 0.0
            if "<think>" in text and "</think>" in text:
                score += 0.5
            try:
                body = text.split("</think>")[-1]
                json.loads(body[body.index("{"):body.rindex("}") + 1])
                score += 0.5
            except (ValueError, json.JSONDecodeError):
                pass
            covered = sum(1 for w in dimension_words if w in text.lower())
            score += min(covered / max(len(dimension_words), 1), 1.0)
            rewards.append(score)
        return rewards

    return [reasoning_reward]


class ProgressCallback:
    """Transformers TrainerCallback that mirrors progress + loss into SQLite."""

    def __init__(self, run_id: str):
        from transformers import TrainerCallback

        outer = self

        class _CB(TrainerCallback):
            def on_log(self, args, state, control, logs=None, **kwargs):
                if not logs:
                    return
                progress = state.global_step / max(state.max_steps, 1)
                metrics = {"loss_curve": [
                    {"step": h.get("step", i), "loss": h.get("loss")}
                    for i, h in enumerate(state.log_history) if "loss" in h
                ]}
                trainer_db.update_run(outer.run_id, progress=round(progress, 4),
                                      metrics=json.dumps(metrics))

        self.run_id = run_id
        self.callback = _CB()


def run_training(run_id: str) -> None:
    run = trainer_db.get_run(run_id)
    if run is None:
        logger.error("run %s not found", run_id)
        return
    try:
        _run_training(run)
    except Exception as exc:
        logger.exception("training run %s failed", run_id)
        trainer_db.mark_failed(run_id, str(exc))
        trainer_db.update_dataset_status(run["dataset_id"], "ready")


def _run_training(run: dict) -> None:
    import torch
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer

    run_id = run["id"]
    hw = detect_hardware()
    if not hw.training_supported:
        trainer_db.mark_failed(run_id, hw.message)
        return

    trainer_db.mark_started(run_id)
    examples = trainer_db.get_examples(run["dataset_id"])
    method = run["method"]
    base_model = run["base_model"] or HF_MODEL_ID
    use_qlora = bool(run["use_qlora"]) and hw.recommended_mode == "qlora" and hw.device == "cuda"

    tokenizer = AutoTokenizer.from_pretrained(base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model_kwargs: dict = {"torch_dtype": torch.bfloat16 if hw.device == "cuda" else torch.float32}
    if use_qlora:
        from transformers import BitsAndBytesConfig

        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
    model = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)

    peft_config = LoraConfig(
        r=run["lora_rank"],
        lora_alpha=run["lora_rank"] * 2,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )

    dataset = _build_dataset(method, examples, tokenizer)
    if len(dataset) == 0:
        raise ValueError("dataset produced no usable training rows")

    output_dir = tempfile.mkdtemp(prefix=f"run_{run_id}_")
    progress = ProgressCallback(run_id)
    common = dict(
        output_dir=output_dir,
        num_train_epochs=run["epochs"],
        learning_rate=run["learning_rate"],
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        logging_steps=1,
        save_strategy="no",
        report_to=[],
    )

    if method == "sft":
        from trl import SFTConfig, SFTTrainer

        trainer = SFTTrainer(
            model=model,
            args=SFTConfig(**common),
            train_dataset=dataset,
            peft_config=peft_config,
            callbacks=[progress.callback],
        )
    elif method == "dpo":
        from trl import DPOConfig, DPOTrainer

        trainer = DPOTrainer(
            model=model,
            args=DPOConfig(**common),
            train_dataset=dataset,
            processing_class=tokenizer,
            peft_config=peft_config,
            callbacks=[progress.callback],
        )
    else:  # grpo
        from trl import GRPOConfig, GRPOTrainer

        trainer = GRPOTrainer(
            model=model,
            args=GRPOConfig(**common, num_generations=4, max_completion_length=512),
            train_dataset=dataset,
            reward_funcs=_grpo_reward_funcs(examples),
            peft_config=peft_config,
            callbacks=[progress.callback],
        )

    result = trainer.train()
    trainer.save_model(output_dir)
    train_loss = result.metrics.get("train_loss")

    gguf_local = _convert_to_gguf(output_dir, base_model)
    adapter_path, gguf_path = _upload_artifacts(run_id, output_dir, gguf_local, examples)

    metrics = {
        "train_loss": train_loss,
        "loss_curve": [
            {"step": h.get("step", i), "loss": h.get("loss")}
            for i, h in enumerate(trainer.state.log_history) if "loss" in h
        ],
    }
    trainer_db.mark_completed(run_id, adapter_path, gguf_path, train_loss, metrics)
    trainer_db.update_dataset_status(run["dataset_id"], "completed")


def _convert_to_gguf(adapter_dir: str, base_model: str) -> str | None:
    out_path = str(Path(adapter_dir) / "adapter.gguf")
    try:
        subprocess.run(
            ["python", CONVERT_SCRIPT, adapter_dir, "--outfile", out_path, "--base", base_model],
            check=True,
            capture_output=True,
            text=True,
            timeout=1800,
        )
        return out_path
    except Exception as exc:
        logger.warning("GGUF conversion failed: %s", exc)
        return None


def _upload_artifacts(run_id: str, adapter_dir: str, gguf_local: str | None,
                      examples: list[dict]) -> tuple[str, str | None]:
    from minio import Minio

    client = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY,
                   secret_key=MINIO_SECRET_KEY, secure=False)
    if not client.bucket_exists(ADAPTER_BUCKET):
        client.make_bucket(ADAPTER_BUCKET)

    snapshot_path = Path(adapter_dir) / "dataset_snapshot.json"
    snapshot_path.write_text(json.dumps([e["id"] for e in examples]))

    uploaded_gguf = None
    for file in Path(adapter_dir).iterdir():
        if file.is_file() and file.name in (
            "adapter_config.json", "adapter_model.safetensors",
            "adapter.gguf", "training_metrics.json", "dataset_snapshot.json",
        ):
            object_name = f"{run_id}/{file.name}"
            client.fput_object(ADAPTER_BUCKET, object_name, str(file))
            if file.name == "adapter.gguf":
                uploaded_gguf = f"{ADAPTER_BUCKET}/{object_name}"
    return f"{ADAPTER_BUCKET}/{run_id}/", uploaded_gguf


def stage_adapter(run_id: str) -> bool:
    """Copy the run's GGUF adapter into /models/adapter.gguf for the llamacpp service."""
    from minio import Minio

    client = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY,
                   secret_key=MINIO_SECRET_KEY, secure=False)
    MODELS_DIR.mkdir(exist_ok=True)
    try:
        client.fget_object(ADAPTER_BUCKET, f"{run_id}/adapter.gguf", str(MODELS_DIR / "adapter.gguf"))
        return True
    except Exception as exc:
        logger.error("failed to stage adapter for run %s: %s", run_id, exc)
        return False
