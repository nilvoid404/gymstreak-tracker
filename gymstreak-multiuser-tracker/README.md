# GymStreak (multi-user)

A real app for you and your gym bros. Each person has a username, a password, and their own workout record. Install it on the home screen and it feels like a native app.

This is **not** the GitHub-commit tracker. That one stays in `gymstreak-tracker` for your green squares. This one is the crew app — no GitHub token, no gist, no shared password.

## What you get

- Username + password accounts
- Passwords stored as a **bcrypt hash** (encrypted one-way — they cannot be decrypted)
- Each bro only edits their own log
- Crew leaderboard + tap someone to see their calendar
- Notes stay private
- Optional invite code so random people can’t join
- Add to Home Screen (PWA) on iPhone and Android
- Free to host

## Why we don’t “decrypt” passwords

A login that can decrypt passwords is a weak login. If the database leaks, every password is readable.

GymStreak does what real apps do:

1. On sign-up the password is **hashed** with bcrypt.
2. On login the typed password is hashed again and compared.
3. The original password is never stored, so it cannot be read back.

The “Show password” button only reveals what you are typing in the form. It does not unlock a stored password.

## Run it locally

```bash
cd gymstreak-multiuser-tracker
cp .env.example .env
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Default invite code is `GYMBROS`. Change it in `.env`.

## Put it on the internet (free)

GitHub Pages cannot run this app — it needs a small Node server. Use **Render** (free):

1. Create a GitHub repo `gymstreak-multiuser-tracker` and push this folder.
2. Go to [render.com](https://render.com) → New → Web Service → connect the repo.
3. Runtime: Node. Build: `npm install`. Start: `npm start`.
4. Add env var `INVITE_CODE` = your secret word.
5. Deploy. You get a free URL like `https://gymstreak.onrender.com`.

The first visit after idle time can take ~30 seconds (free tier sleeps). After that it is instant.

## Free domain

You already get a free HTTPS URL from Render.

Want a nicer name? Use [is-a.dev](https://is-a.dev) for `gymstreak.is-a.dev`, then add it as a custom domain on Render.

## Add to Home Screen

**iPhone (Safari)**  
Share → **Add to Home Screen** → Add.

**Android (Chrome)**  
Menu → **Install app** or **Add to Home screen**.

## Invite your bros

1. Send them the live URL.
2. Send the invite code.
3. They create a username + password.
4. They add it to their home screen.

You cannot see their password. You can see their streak and workout types.
