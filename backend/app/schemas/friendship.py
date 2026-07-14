from pydantic import BaseModel


class FriendRequestCreate(BaseModel):
    username: str | None = None
    friend_code: str | None = None
