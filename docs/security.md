# Authentication and ownership

- Server actions validate email, password and action mode using Zod. Passwords require 10–128 characters. Provider errors are mapped to friendly generic messages; logs exclude credentials, passwords and provider response bodies.
- Sessions use Supabase SSR cookies. Middleware verifies users with `getUser()` and carries refreshed cookies onto both normal and redirect responses. The dynamic workspace layout also checks the authenticated user; authorization does not depend on middleware alone.
- Protected URL prefixes are `/projects`, `/import`, `/reports` and `/settings`; route-group folder names are not URL segments. Register future workspace prefixes in middleware, keep their layout guard, and call `requireProject` in project-specific handlers.
- The public anon key is safe for the browser only because ownership is enforced by RLS. Never expose a service-role key or use it to bypass project ownership.
- Logout uses a server action and reports provider failures. Confirmation accepts only email/signup token types and redirects to fixed local destinations; caller-provided redirect URLs are ignored.
- Supabase Auth supplies its own abuse limits. Application-specific Upstash rate limiting is a future integration; do not assume those limits have been implemented here.
- Do not cache authenticated HTML across users. The workspace layout is dynamic, and session middleware/confirmation responses use private, no-store caching.
