from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import AppSetting

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: str


@router.get("")
def get_all(session: Session = Depends(get_session)):
    rows = session.exec(select(AppSetting)).all()
    return {row.key: row.value for row in rows}


@router.put("/{key}")
def put_setting(key: str, body: SettingUpdate, session: Session = Depends(get_session)):
    row = session.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=body.value)
    else:
        row.value = body.value
    session.add(row)
    session.commit()
    return {key: body.value}
