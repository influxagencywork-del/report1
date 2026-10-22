import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client cho Server Components / Route Handlers. Đọc bằng session của user → RLS áp dụng. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Gọi từ Server Component: không ghi được cookie, middleware sẽ làm mới session.
        }
      },
    },
  });
}
