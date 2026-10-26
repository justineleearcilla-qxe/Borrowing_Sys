import { useCallback, useEffect, useState } from "react";
import { api, apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { User, UserStatus } from "../../types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from "../../components/ui";

const STATUSES: Array<UserStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "ACTIVE",
  "INACTIVE",
];

const statusTone: Record<UserStatus, "yellow" | "green" | "gray"> = {
  PENDING: "yellow",
  ACTIVE: "green",
  INACTIVE: "gray",
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<UserStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [clearingEligibility, setClearingEligibility] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<User[]>("/users", {
        params: {
          ...(status !== "ALL" ? { status } : {}),
          ...(search ? { q: search } : {}),
        },
      });
      setUsers(res.data);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function changeStatus(target: User, action: "approve" | "deactivate" | "reactivate") {
    setBusyId(target.id);
    setError("");
    try {
      await api.patch(`/users/${target.id}/${action}`);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function clearEligibility(target: User) {
    setBusyId(target.id);
    setError("");
    try {
      await api.patch(`/users/${target.id}/clear-blacklist`);
      setClearingEligibility(null);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Review registration requests and manage account access."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or email..."
          aria-label="Search users by name or email"
          maxLength={100}
          className="w-full max-w-md flex-1"
        />
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as UserStatus | "ALL")}
          aria-label="Filter users by status"
          className="w-auto"
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value === "ALL" ? "All statuses" : value}
            </option>
          ))}
        </Select>
      </div>
      <Card>
        <CardHeader title={`${users.length} user(s)`} />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No users found" hint="Try another status or search term." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Email</th>
                  <th className="th">Role</th>
                  <th className="th">Status</th>
                  <th className="th">Eligibility</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((entry) => (
                  <tr key={entry.id}>
                    <td className="td font-medium">{entry.name}</td>
                    <td className="td">{entry.email}</td>
                    <td className="td">{entry.role}</td>
                    <td className="td">
                      <Badge tone={statusTone[entry.status]}>{entry.status}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-600">
                          {entry.penaltyPoints} penalty{" "}
                          {entry.penaltyPoints === 1 ? "point" : "points"}
                        </span>
                        {entry.isBlacklisted && (
                          <Badge tone="red">Blacklisted</Badge>
                        )}
                        {(entry.overdueLoanCount ?? 0) > 0 && (
                          <Badge tone="yellow">
                            {entry.overdueLoanCount} overdue{" "}
                            {(entry.overdueLoanCount ?? 0) === 1 ? "loan" : "loans"}
                          </Badge>
                        )}
                        {!entry.isBlacklisted &&
                          (entry.overdueLoanCount ?? 0) === 0 &&
                          entry.penaltyPoints === 0 && (
                            <Badge tone="green">Eligible</Badge>
                          )}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        {entry.status === "PENDING" && (
                          <Button
                            variant="success"
                            size="sm"
                            disabled={busyId === entry.id}
                            onClick={() => void changeStatus(entry, "approve")}
                          >
                            Approve
                          </Button>
                        )}
                        {entry.status === "ACTIVE" && entry.id !== currentUser?.id && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busyId === entry.id}
                            onClick={() => setDeactivating(entry)}
                          >
                            Deactivate
                          </Button>
                        )}
                        {entry.status === "INACTIVE" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId === entry.id}
                            onClick={() => void changeStatus(entry, "reactivate")}
                          >
                            Reactivate
                          </Button>
                        )}
                        {(entry.isBlacklisted || entry.penaltyPoints > 0) && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId === entry.id}
                            onClick={() => setClearingEligibility(entry)}
                          >
                            Clear blacklist
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal
        open={deactivating !== null}
        showCloseButton={false}
        onClose={() => {
          if (busyId === null) setDeactivating(null);
        }}
        title="Deactivate account?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busyId !== null}
              onClick={() => setDeactivating(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busyId !== null || deactivating === null}
              onClick={() => {
                if (!deactivating) return;
                const target = deactivating;
                setDeactivating(null);
                void changeStatus(target, "deactivate");
              }}
            >
              {busyId !== null ? "Deactivating..." : "Deactivate account"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {deactivating
            ? `${deactivating.name} will no longer be able to sign in.`
            : "This account will no longer be able to sign in."}
        </p>
      </Modal>
      <Modal
        open={clearingEligibility !== null}
        showCloseButton={false}
        onClose={() => {
          if (busyId === null) setClearingEligibility(null);
        }}
        title="Clear borrower penalties?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busyId !== null}
              onClick={() => setClearingEligibility(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busyId !== null || clearingEligibility === null}
              onClick={() => {
                if (clearingEligibility) void clearEligibility(clearingEligibility);
              }}
            >
              {busyId !== null ? "Clearing..." : "Clear blacklist and points"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {clearingEligibility
            ? `This will remove ${clearingEligibility.name}'s blacklist and reset their penalty points to zero.`
            : "This will clear the blacklist and reset penalty points to zero."}
        </p>
      </Modal>
    </>
  );
}
