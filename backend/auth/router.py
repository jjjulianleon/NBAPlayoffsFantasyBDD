from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from ..database import get_pool
from .utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    pool = await get_pool()
    existing = await pool.fetchrow(
        "SELECT user_id FROM users WHERE username = $1 OR email = $2",
        body.username, body.email,
    )
    if existing:
        raise HTTPException(status_code=409, detail="Username o email ya registrado")

    hashed = hash_password(body.password)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "CALL sp_register_user($1, $2, $3, $4, $5)",
            body.username,
            body.email,
            hashed,
            body.display_name,
            None,
        )
    if not row or row["p_user_id"] is None:
        raise HTTPException(status_code=500, detail="No se pudo crear el usuario")
    token = create_access_token(row["p_user_id"], body.username)
    return TokenResponse(access_token=token, user_id=row["p_user_id"], username=body.username)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT user_id, username, password_hash FROM users WHERE username = $1",
        body.username,
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    await pool.execute("UPDATE users SET last_login = NOW() WHERE user_id = $1", row["user_id"])
    token = create_access_token(row["user_id"], row["username"])
    return TokenResponse(access_token=token, user_id=row["user_id"], username=row["username"])


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    email: EmailStr | None = None


@router.put("/me")
async def update_profile(body: UpdateProfileRequest, user=Depends(get_current_user)):
    pool = await get_pool()
    updates = []
    params = []
    idx = 1

    if body.display_name is not None:
        updates.append(f"display_name = ${idx}")
        params.append(body.display_name)
        idx += 1
    if body.email is not None:
        existing = await pool.fetchrow(
            "SELECT user_id FROM users WHERE email = $1 AND user_id != $2",
            body.email, user["user_id"],
        )
        if existing:
            raise HTTPException(status_code=409, detail="Email ya registrado por otro usuario")
        updates.append(f"email = ${idx}")
        params.append(body.email)
        idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    params.append(user["user_id"])
    await pool.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE user_id = ${idx}",
        *params,
    )
    return {"message": "Perfil actualizado"}
