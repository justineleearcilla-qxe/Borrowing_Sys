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
    <div className="flex min-h-screen flex-col rounded-none bg-primary-900 p-4">
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-2 self-start border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
      >
        <Icon name="arrow-left" className="h-4 w-4" />
        Back to catalog
      </Link>
      <div className="my-auto w-full max-w-md self-center">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">EquipHub</h1>
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
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
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
        <div className="mt-4 border border-primary-700 bg-primary-800 p-4 text-xs text-slate-300">
          <p className="mb-1 font-bold uppercase tracking-wide text-slate-200">
            Demo accounts
          </p>
          <p>Admin: admin@school.edu / Password123!</p>
          <p>Student: maria.student@school.edu / Password123!</p>
          <p>Faculty: david.faculty@school.edu / Password123!</p>
        </div>
      </div>
    </div>
  );
}
