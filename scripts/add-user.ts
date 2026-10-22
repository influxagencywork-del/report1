/**
 * Thêm / xóa người được xem dashboard.
 *
 *   npm run add-user -- email@congty.vn            # role viewer
 *   npm run add-user -- email@congty.vn admin      # role admin
 *   npm run add-user -- email@congty.vn --remove   # thu hồi quyền
 *
 * Tạo user trong Supabase Auth (đã xác nhận email) + thêm vào allowed_users.
 * Vì đăng ký công khai đã tắt, chỉ người được thêm bằng script này mới nhận được magic link.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();

const [rawEmail, arg] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Cách dùng: npm run add-user -- email@congty.vn [viewer|admin|--remove]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function findAuthUser(target: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === target);
    if (u || data.users.length < 1000) return u ?? null;
  }
}

async function main() {
  if (arg === "--remove") {
    const { error } = await db.from("allowed_users").delete().eq("email", email);
    if (error) throw error;
    const u = await findAuthUser(email);
    if (u) await db.auth.admin.deleteUser(u.id);
    console.log(`✓ Đã thu hồi quyền của ${email}`);
    return;
  }

  const role = arg === "admin" ? "admin" : "viewer";
  if (!(await findAuthUser(email))) {
    const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
  }
  const { error } = await db.from("allowed_users").upsert({ email, role });
  if (error) throw error;
  console.log(`✓ ${email} (${role}) đã có thể đăng nhập bằng magic link`);
}

main().catch((e) => {
  console.error("✗", e.message ?? e);
  process.exit(1);
});
