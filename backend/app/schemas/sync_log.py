from pydantic import BaseModel

class SyncLogResponse(BaseModel):
    id: int
    channel: str
    time: str
    status: str
    records: int
    msg: str

    class Config:
        from_attributes = True
