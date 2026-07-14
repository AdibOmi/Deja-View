from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str


class UserUpdate(BaseModel):
    display_name: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    friend_code: str | None = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
