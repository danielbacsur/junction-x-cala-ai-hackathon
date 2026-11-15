<h1 align="center">Cabala</h1>

<p align="center">A fundraising agent for founders who are raising and investors who are sourcing.</p>

<p align="center">
  <a href="https://youtu.be/WIAHzr6kR50">
    <img src="docs/video-preview.jpg" alt="Watch Cabala — Junction 2026 submission video" width="100%" />
  </a>
</p>

At Slush, a useful meeting can be hidden in a shared backer, a recent public grant or a commercial agreement. Finding it means reading across company records before you ever write an outreach message. Cabala does that research and comes back with who to meet and why.

Brief it in a sentence: *“We are raising a seed round. Who should we meet at Slush?”* or *“We invest in climate hardware. Which companies should we see first?”*

## How it works

1. **Set the mandate.** Identify your company or fund and narrow the search by stage, sector or country. Cabala asks for the information it needs to continue.
2. **Discover connections.** It joins Cala’s funding rounds, public-money signals, ownership and agreements into sourced paths, then recommends three candidates with a reason for each.
3. **Prepare the meeting.** Pick a name and get a packet: why meet, why hesitate, what to ask and a draft message for you to send.

The Desk keeps the underlying evidence, research gaps and packet versions one link away. Claims are checked against their sources before a packet reaches your sign-off. Cabala sends nothing on your behalf; a connection is a reason to investigate, not a promised introduction.

Built at Junction 2026 for Cala’s **Make Unicorns Real** challenge, with **Next.js, eve and PostgreSQL**.

## Run locally

Requires Node.js 24+, npm 11+, PostgreSQL, Cala API access and model credentials for eve. Follow the [setup notes](docs/DEVELOPMENT.md#layout-and-local-use) to configure credentials and apply the database migrations before starting.

```sh
npm ci
npm run dev
```

The web app runs at [localhost:3000](http://localhost:3000); the agent runs on port 3001. The [development guide](docs/DEVELOPMENT.md) covers checks, scheduled research and data limits.
