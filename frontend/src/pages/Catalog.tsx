import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import type { Category, Item } from "../types";
<<<<<<< HEAD
=======
import { conditionTone, formatDate } from "../lib/format";
>>>>>>> origin/main
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui";
import { CategoryIcon } from "../components/CategoryIcon";
import { Icon } from "../components/Icon";
import { ItemImage } from "../components/ItemImage";

function isAvailable(item: Item) {
  return (
    item.status === "AVAILABLE" &&
    item.condition !== "DAMAGED" &&
    item.availableQuantity > 0
  );
}

export default function Catalog() {
  const { user } = useAuth();
  const { add: addToCart, has: inCart } = useCart();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [department, setDepartment] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get<Category[]>("/categories"), api.get<Item[]>("/items")])
      .then(([cats, its]) => {
        if (cancelled) return;
        setCategories(cats.data);
        setItems(its.data);
      })
      .catch((e) => !cancelled && setError(apiErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.department && set.add(i.department));
    return [...set].sort();
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (categoryId !== null && i.categoryId !== categoryId) return false;
        if (department && i.department !== department) return false;
        if (
          availableOnly &&
          !isAvailable(i)
        )
          return false;
        if (q) {
          const needle = q.toLowerCase();
          if (
            !i.name.toLowerCase().includes(needle) &&
            !i.code.toLowerCase().includes(needle) &&
            !(i.description ?? "").toLowerCase().includes(needle)
          )
            return false;
        }
        return true;
      }),
    [items, categoryId, department, availableOnly, q],
  );

  if (loading)
    return (
      <div className="flex justify-center py-20 text-primary-800">
        <Spinner className="h-8 w-8" />
      </div>
    );
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const availableCount = items.filter(
    isAvailable,
  ).length;
  const totalUnits = items.reduce((sum, item) => sum + item.totalQuantity, 0);

  return (
    <>
      <section className="catalog-hero mb-8 overflow-hidden p-6 text-white shadow-sm sm:p-9">
        <div className="relative z-10 max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
            Campus equipment desk
          </div>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            The right gear for your next class, project, or event.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-200 sm:text-base">
            Explore what is ready to go across campus. You can browse the full
            collection freely; a school account is only needed when you request,
            borrow, or return equipment.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button>
                  Open my dashboard
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button>
                  Sign in to borrow
                </Button>
              </Link>
            )}
            <span className="text-xs text-slate-300">
              School email required: @school.edu
            </span>
          </div>
        </div>
        <div className="catalog-hero-mark" aria-hidden="true">
          <span>EQ</span>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white px-4 py-4">
          <p className="text-2xl font-bold text-primary-800">{items.length}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Equipment types
          </p>
        </div>
        <div className="bg-white px-4 py-4">
          <p className="text-2xl font-bold text-emerald-600">
            {availableCount}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Ready to request
          </p>
        </div>
        <div className="bg-white px-4 py-4">
          <p className="text-2xl font-bold text-primary-800">{totalUnits}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total units
          </p>
        </div>
        <div className="bg-white px-4 py-4">
          <p className="text-2xl font-bold text-primary-800">
            {categories.length}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Collections
          </p>
        </div>
      </div>

      <PageHeader
        title="Browse the collection"
        description="Search equipment, filter by category, and check availability."
      />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search equipment..."
              className="pl-9"
            />
          </div>
          <Select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            aria-pressed={categoryId === null}
            className={`border px-3 py-2 text-xs font-semibold transition-colors ${
              categoryId === null
                ? "border-primary-900 bg-primary-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-primary-900 hover:text-primary-900"
            }`}
          >
            All categories
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              aria-pressed={categoryId === category.id}
              className={`flex items-center gap-2 border px-3 py-2 text-xs font-semibold transition-colors ${
                categoryId === category.id
                  ? "border-primary-900 bg-primary-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-primary-900 hover:text-primary-900"
              }`}
            >
              <CategoryIcon slug={category.slug} className="h-4 w-4" />
              {category.name}
            </button>
          ))}
<<<<<<< HEAD
=======
        </aside>

        <div>
          <Card className="mb-4 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="relative">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name or code..."
                  className="pl-9"
                />
              </div>
              <Select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              <label className="flex cursor-pointer items-center gap-2 px-1 text-sm font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="h-4 w-4 accent-primary-800"
                />
                Available now only
              </label>
              <p className="self-center text-right text-xs text-slate-400 sm:text-left">
                {filtered.length} item(s) found
              </p>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState
              title="No equipment matches your filters"
              hint="Try clearing the search or filters."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item, index) => {
                const out =
                  item.availableQuantity === 0 || item.status !== "AVAILABLE";
                return (
                  <Card
                    key={item.id}
                    className="catalog-item group flex flex-col"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <div
                      className={`flex h-36 items-center justify-center overflow-hidden ${out ? "bg-slate-100" : "bg-primary-50"} text-primary-300`}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <CategoryIcon
                          slug={item.category.slug}
                          className="h-14 w-14"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">
                            {item.name}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {item.code}
                          </p>
                        </div>
                        <Badge tone={conditionTone[item.condition] as never}>
                          {item.condition}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {item.category.name}
                        {item.department ? ` - ${item.department}` : ""}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tone={out ? "red" : "green"}>
                            {item.status === "AVAILABLE"
                              ? `${item.availableQuantity} of ${item.totalQuantity} available`
                              : item.status}
                          </Badge>
                          {out && item.nextAvailableDate && (
                            <Badge tone="blue">
                              Back {formatDate(item.nextAvailableDate)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {user &&
                            item.status === "AVAILABLE" &&
                            item.availableQuantity > 0 &&
                            (inCart(item.id) ? (
                              <Badge tone="green">In cart</Badge>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => addToCart(item)}
                                aria-label={`Add ${item.name} to cart`}
                              >
                                <Icon name="cart" className="h-4 w-4" />
                                Add
                              </Button>
                            ))}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/items/${item.id}`)}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
>>>>>>> origin/main
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
              className="h-4 w-4 accent-primary-900"
            />
            Available only
          </label>
          <p className="text-xs text-slate-500">{filtered.length} item(s)</p>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No equipment matches your filters"
          hint="Try clearing the search or filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item, index) => {
            const available = isAvailable(item);
            const lowStock =
              available &&
              (item.availableQuantity < 5 ||
                (item.totalQuantity > 0 &&
                  item.availableQuantity / item.totalQuantity <= 0.2));
            const availability = !available
              ? "Unavailable"
              : lowStock
                ? `Only ${item.availableQuantity} left`
                : `${item.availableQuantity} available`;
            return (
              <Link
                key={item.id}
                to={`/items/${item.id}`}
                className="catalog-item group flex min-h-full flex-col border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-900"
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <ItemImage
                  imageUrl={item.imageUrl}
                  categorySlug={item.category.slug}
                  alt={item.name}
                  className="aspect-[4/3] w-full"
                  iconClassName="h-14 w-14"
                />
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="line-clamp-2 min-h-12 text-base font-semibold text-slate-800">
                    {item.name}
                  </h2>
                  <p className="mt-1 min-h-5 truncate text-xs text-slate-500">
                    {item.category.name}
                  </p>
                  <p
                    className={`mt-auto pt-4 text-sm font-medium ${
                      !available
                        ? "text-slate-500"
                        : lowStock
                          ? "text-amber-700"
                          : "text-green-700"
                    }`}
                  >
                    {availability}
                  </p>
                  {user?.role === "ADMIN" && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-xs text-slate-500">
                      <span className="font-mono">{item.code}</span>
                      <span>{item.condition}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
