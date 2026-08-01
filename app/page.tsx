import Image from 'next/image'
import { getDb } from '@/lib/db'
import { sessionToken } from '@/lib/session'

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">GitHub History Timeline</h1>
        <p className="max-w-md text-zinc-600">
          Your entire GitHub history as one continuous, zoomable timeline.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
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
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <a
          href="/api/auth/signin"
          className="rounded-md bg-zinc-900 px-6 py-3 text-white hover:bg-zinc-700"
        >
          Sign in with GitHub
        </a>
      )}
    </main>
  );
}
