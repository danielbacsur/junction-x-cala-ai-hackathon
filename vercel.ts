import { agent, app } from "@fundraising/package-vercel";

export default {
  // The database is in Frankfurt, so the functions that query it run there too.
  regions: ["fra1"],

  services: {
    "app-web": app("web"),
    "agent-cabala": await agent("cabala"),
  },

  routes: [
    {
      src: "^/eve/cabala/v1/(.*)$",
      destination: { type: "service", service: "agent-cabala" },
    },

    {
      src: "^(.*)$",
      destination: { type: "service", service: "app-web" },
    },
  ],
};
