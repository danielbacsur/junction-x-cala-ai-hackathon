import { agent, app } from "@fundraising/package-vercel";

export default {
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
