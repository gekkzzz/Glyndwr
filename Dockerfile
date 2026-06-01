FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure data directory exists
RUN mkdir -p data

# Non-root user for security
RUN useradd -m -u 1000 glyndwr && chown -R glyndwr:glyndwr /app
USER glyndwr

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--log-level", "info"]
