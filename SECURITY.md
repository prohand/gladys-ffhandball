# Security policy

## Supported versions

Only the latest release of the FFHandball integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-ffhandball](https://github.com/prohand/gladys-ffhandball/security), then
**Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only asks the
maintainers for a private contact, without any detail of the problem, and send the report
there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of the
integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), and the
ffhandball.fr website and its data, which belong to the Fédération Française de Handball.

## What the integration does, for your threat model

- It only sends public `GET` requests to `https://www.ffhandball.fr`, at the pace of the
  configured refresh (30 minutes by default). It needs no account, no token and no secret,
  and stores none.
- It writes a single file, `/data/state.json` (what it already announced to the scenes:
  results, reminders, ranks), in the only writable volume of its container.
- It never opens a port and never receives anything from the network.
- Data read from ffhandball.fr (team names, dates, scores) is treated as untrusted text:
  it is only displayed, never executed or used to build a request to another host.

## Good practices for users

- Keep Gladys and the integration up to date.
- Paste team addresses copied from `www.ffhandball.fr` only: the integration ignores any
  other address.
