# 01 — Scaffold + GitHub OAuth sign-in

**What to build:** The app boots (Next.js + Tailwind + shadcn registry stack). A visitor signs in with GitHub OAuth, the session persists across visits, and the user can sign out. The signed-in identity is visible in the UI.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `npm create` boot of the Next.js app runs and renders a page
- [x] GitHub OAuth app configured; login redirects to GitHub and back
- [x] Session persists across browser restarts
- [x] Signed-in user's GitHub identity (username/avatar) visible in the UI
- [x] Sign-out works and clears the session
