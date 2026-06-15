"""In-memory job registry with async progress streams for SSE endpoints."""
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Job:
    id: str
    kind: str  # 'ingestion' | 'scoring' | 'training'
    status: str = "running"  # running | completed | failed
    events: list[dict] = field(default_factory=list)
    result: Optional[Any] = None
    _subscribers: list[asyncio.Queue] = field(default_factory=list)

    def publish(self, event: dict) -> None:
        self.events.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)

    def finish(self, status: str = "completed", result: Any = None) -> None:
        self.status = status
        self.result = result
        self.publish({"type": "done", "status": status})

    async def stream(self):
        """Yield past events, then live events until the job finishes."""
        queue: asyncio.Queue = asyncio.Queue()
        # Snapshot history and subscribe atomically (single-threaded event loop)
        history = list(self.events)
        self._subscribers.append(queue)
        try:
            for event in history:
                yield event
                if event.get("type") == "done":
                    return
            while True:
                event = await queue.get()
                yield event
                if event.get("type") == "done":
                    return
        finally:
            self._subscribers.remove(queue)


_jobs: dict[str, Job] = {}


def create_job(kind: str) -> Job:
    job = Job(id=str(uuid.uuid4()), kind=kind)
    _jobs[job.id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)
