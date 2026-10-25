import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Field, Input, Select } from "../components/ui";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "STUDENT",
    department: "",
  });
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        department: form.department || undefined,
      });
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-sm text-slate-300">
            Registration requires a valid school email address
          </p>
        </div>
        {registered ? (
          <div className="card space-y-4 p-6">
            <Alert tone="success">
              Registration submitted. Your account must be approved by an
              administrator before you can sign in.
            </Alert>
            <Link
              to="/login"
              className="block text-center font-semibold text-primary-800 hover:underline"
            >
              Return to sign in
            </Link>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Full name">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Juan Dela Cruz"
              required
            />
          </Field>
          <Field label="School email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@school.edu"
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password"
                value={form.confirm}
                onChange={(e) => set("confirm", e.target.value)}
                required
                minLength={8}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="I am a">
              <Select
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
              >
                <option value="STUDENT">Student</option>
                <option value="FACULTY">Faculty</option>
              </Select>
            </Field>
            <Field label="Department (optional)">
              <Input
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="e.g. Computer Science"
              />
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Creating account..." : "Register"}
          </Button>
          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-primary-800 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
        )}
      </div>
    </div>
  );
}
