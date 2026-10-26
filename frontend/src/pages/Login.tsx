import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Field, Input } from "../components/ui";
import { Icon } from "../components/Icon";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/cspc-logo.png"
            alt="Camarines Sur Polytechnic Colleges seal"
            className="mx-auto mb-3 h-20 w-20 object-contain"
            width="80"
            height="80"
          />
          <p className="text-sm font-semibold text-white">
            Camarines Sur Polytechnic Colleges
          </p>
          <p className="text-xs text-slate-300">Nabua, Camarines Sur</p>
          <h1 className="mt-2 text-xl font-bold text-white">
            Equipment Borrowing System
          </h1>
          <p className="text-sm text-slate-300">
            Your campus equipment desk, online
          </p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="School email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
              >
                <Icon name={showPassword ? "eye-off" : "eye"} className="h-5 w-5" />
              </button>
            </div>
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-center text-sm text-slate-500">
            No account yet?{" "}
            <Link
              to="/register"
              className="font-semibold text-primary-800 hover:underline"
            >
              Register here
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
