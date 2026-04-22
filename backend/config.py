import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://playoff:playoff_dev@localhost:5432/playoff_hoops",
)
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-prod")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_LINEUP_MODEL = os.getenv("OPENAI_LINEUP_MODEL", "gpt-4.1-mini")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 h
