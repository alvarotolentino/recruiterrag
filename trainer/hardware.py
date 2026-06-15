"""Hardware detection — picks LoRA vs QLoRA, or blocks training entirely (spec §13.5.4)."""
from dataclasses import dataclass

MIN_VRAM_GB = 6
LORA_VRAM_GB = 16


@dataclass
class HardwareInfo:
    device: str  # cuda | mps | none
    gpu_name: str | None
    vram_gb: float | None
    training_supported: bool
    recommended_mode: str | None  # 'lora' | 'qlora'
    message: str


def detect_hardware() -> HardwareInfo:
    import torch

    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        vram_gb = props.total_memory / (1024 ** 3)
        if vram_gb < MIN_VRAM_GB:
            return HardwareInfo(
                device="cuda", gpu_name=props.name, vram_gb=round(vram_gb, 1),
                training_supported=False, recommended_mode=None,
                message=f"GPU has {vram_gb:.1f} GB VRAM; at least {MIN_VRAM_GB} GB is required.",
            )
        mode = "lora" if vram_gb >= LORA_VRAM_GB else "qlora"
        return HardwareInfo(
            device="cuda", gpu_name=props.name, vram_gb=round(vram_gb, 1),
            training_supported=True, recommended_mode=mode,
            message=f"{props.name} ({vram_gb:.1f} GB) — using {mode.upper()}.",
        )

    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return HardwareInfo(
            device="mps", gpu_name="Apple Silicon (MPS)", vram_gb=None,
            training_supported=True, recommended_mode="lora",
            message="Apple Silicon detected — using LoRA via MPS backend.",
        )

    return HardwareInfo(
        device="none", gpu_name=None, vram_gb=None,
        training_supported=False, recommended_mode=None,
        message="No compatible GPU found. Fine-tuning requires a GPU with at least 6 GB of memory.",
    )
