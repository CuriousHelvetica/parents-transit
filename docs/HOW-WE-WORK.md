# How the owner wants to work

This project has been built in conversation between the owner and an AI assistant. These are the owner's
preferences, written down so they carry over to any future session or collaborator.

## Before building

- **Ask first.** Ask clarifying questions before giving detailed answers or building. Don't jump to
  conclusions about what is wanted.
- **Never guess, always verify.** Read the code, run a test, or search before stating a fact. When something
  can't be verified, say so plainly and say what would settle it.
- **Talk before acting on anything with a choice in it.** "Let's talk before action" is a common instruction.
  Small, clearly specified fixes can go straight ahead.
- **Give a recommendation.** Lay out the options, say which one you would pick and why, and let the owner
  decide. The owner sometimes chooses differently; record it as their decision.

## Changing how the app looks

- **Mock up first.** Take screenshots of the real app with the change faked in, at iPhone size, and send them.
  Show the options side by side.
- Wait for a choice before building.
- Check new or changed screens in both themes, and at 393, 375 and 320 points wide.

## Explaining

- Plain language and outcomes. The owner follows technical detail but wants to know what changed for the
  parents, not a tour of the code.
- Say what was tested and how, and what could not be tested here.
- Be honest about mistakes and limits. Don't describe something as confirmed when only a simulation ran.

## Versions and the change log

- Small fixes bump the last number (v1.8.2 → v1.8.3). New features bump the middle number (v1.9.0). The owner
  sometimes names the version.
- Every change updates `version.js` (version and date) and adds an entry to `CHANGELOG.md`.
- The version at the bottom of the main screen is how the owner checks that a phone has picked up an update.
- Keep `SETUP.md`, `README.md`, `CLAUDE.md` and these notes in step with the app.

## Testing and shipping

- Run `npm test`; push only if every check passes.
- When a check fails, work out whether the app or the check is wrong before changing either.
- When behaviour changes, update the checks and add new ones for the new behaviour.
- Push straight to `main`. No pull requests.
- After pushing, confirm that the "pages build and deployment" run for that commit succeeded, and report it.
- Then list what the owner should try on a real iPhone, because this environment cannot reach Transport for
  NSW, OpenStreetMap or Cloudflare, and cannot reproduce iPhone-only behaviour.

## Privacy

- The repository is public and Git history is permanent.
- Never commit the parents' home address, anyone's name, or contact details. The home address is entered on
  each phone.
- If a request would publish something personal, stop and point it out before doing it.

## The Worker

- It is deployed by hand: the owner pastes `worker/worker.js` into the Cloudflare dashboard.
- Avoid changing it unless needed. When it must change, walk the owner through the paste and have them open
  `<worker address>/status` to confirm.

## Judging a change

Ask how it serves two people of about 80 who read Chinese, press slowly, and should never have to work
something out. Fewer steps, fixed positions, larger text and honest warnings win over features.
