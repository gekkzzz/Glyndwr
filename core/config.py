from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    # Server
    app_port: int = Field(default=7860, alias="APP_PORT")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")

    # API Keys
    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(default=None, alias="ANTHROPIC_API_KEY")
    groq_api_key: Optional[str] = Field(default=None, alias="GROQ_API_KEY")
    openrouter_api_key: Optional[str] = Field(default=None, alias="OPENROUTER_API_KEY")
    gemini_api_key: Optional[str] = Field(default=None, alias="GEMINI_API_KEY")
    deepseek_api_key: Optional[str] = Field(default=None, alias="DEEPSEEK_API_KEY")

    # Ollama (opt-in: set OLLAMA_HOST in .env to enable)
    ollama_host: Optional[str] = Field(default=None, alias="OLLAMA_HOST")

    # Database
    database_url: str = Field(default="sqlite:///./data/glyndwr.db", alias="DATABASE_URL")

    # Defaults
    default_theme: str = Field(default="dragon", alias="DEFAULT_THEME")
    default_model: str = Field(default="gpt-4o-mini", alias="DEFAULT_MODEL")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "populate_by_name": True,
        "extra": "ignore",
    }


settings = Settings()
