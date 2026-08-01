import Image from "next/image"
import { getDb } from "@/lib/db"
import { sessionToken } from "@/lib/session"
import { ActivityIcon } from "@/components/animate-ui/icons/activity"
import { DotmSquare3 } from "@/components/ui/dotm-square-3"
import { CrowdCanvas } from "@/components/ui/skiper-ui/skiper39"
import { Link001 } from "@/components/ui/skiper-ui/skiper40"

const ERRORS: Record<string, string> = {
  state: 'Sign-in failed: the state check failed. Try again.',
  github: 'Sign-in failed: GitHub rejected the request. Try again.',
  config: 'Sign-in failed: GitHub OAuth is not configured on this server.',
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const token = await sessionToken()
  const user = token ? getDb().userBySession(token) : null
  const error = ERRORS[(await searchParams).error ?? '']

  return (
    <main className="relative flex min-h-screen flex-col px-6 py-8">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <CrowdCanvas src="/images/peeps/all-peeps.png" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-3">
            <ActivityIcon
              animate="default"
              size={32}
              className="text-primary"
            />
            <h1 className="font-heading text-4xl leading-none tracking-wide">
              GITHUB HISTORY TIMELINE
            </h1>
          </div>
          <p className="max-w-md text-muted-foreground">
            Your entire GitHub history as one continuous, zoomable timeline.
          </p>
        </div>

        {error && (
          <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {user ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              {user.avatarUrl && (
                <Image
                  className="h-10 w-10 rounded-full"
                  src={user.avatarUrl}
                  alt={`${user.login} avatar`}
                  width={40}
                  height={40}
                />
              )}
              <span className="text-lg font-medium">{user.login}</span>
            </div>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="rounded-sm border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <a
            href="/api/auth/signin"
            className="rounded-sm bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in with GitHub
          </a>
        )}
      </div>

      <footer className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row">
        <span className="inline-flex items-center gap-2.5">
          <DotmSquare3
            size={20}
            dotSize={3}
            boxSize={20}
            animated={false}
            ariaLabel="Sync engine standby"
          />
          <span className="font-mono text-xs tracking-widest text-muted-foreground">
            {user ? 'SYNC: STANDBY' : 'SYNC: AWAITING SIGN-IN'}
          </span>
        </span>
        <p className="font-mono text-xs tracking-widest text-muted-foreground">
          BUILT WITH <Link001 href="https://skiper-ui.com">SKIPER UI</Link001>
        </p>
      </footer>
    </main>
  );
}
