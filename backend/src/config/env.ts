import "dotenv/config";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const env = {
  PORT: Number(str("PORT", "4000")),
  DATABASE_URL: str("DATABASE_URL"),
  JWT_SECRET: str("JWT_SECRET", "dev-secret-change-me"),
  JWT_EXPIRES_IN: str("JWT_EXPIRES_IN", "7d"),
  CLIENT_ORIGIN: str("CLIENT_ORIGIN", "http://localhost:5173"),
  SCHOOL_EMAIL_DOMAIN: str("SCHOOL_EMAIL_DOMAIN", "@school.edu").toLowerCase(),
  SMTP_HOST: str("SMTP_HOST"),
  SMTP_PORT: Number(str("SMTP_PORT", "587")),
  SMTP_USER: str("SMTP_USER"),
  SMTP_PASS: str("SMTP_PASS"),
  MAIL_FROM: str("MAIL_FROM", "Equipment Desk <no-reply@school.edu>"),
  UPLOAD_DIR: str("UPLOAD_DIR", "uploads"),
};
