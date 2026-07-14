from pydantic import BaseModel


class ShareCreate(BaseModel):
    movie_id: int
    friend_user_id: int
    comment: str | None = None
