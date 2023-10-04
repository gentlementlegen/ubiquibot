import { EmitterWebhookEventName } from "@octokit/webhooks";
import { Probot, run } from "probot";

import { repoConfig } from "./test-repo-config";
import { updateConfig, waitForNWebhooks, webhookEventEmitter } from "./utils";
import { GithubEvent } from "../types/payload";
import { bindEvents } from "../bindings/event";
import {
  setAdminUser,
  CustomOctokit,
  getAdminUser,
  setAdminUsername,
  repo,
  owner,
  getAdminUsername,
  setCollaboratorUser,
  getCollaboratorUser,
  setCollaboratorUsername,
  getCollaboratorUsername,
  setServer,
  orgConfig,
} from "./commands-test";

export function beforeAllHandler(): jest.ProvidesHookCallback {
  return async () => {
    const adminPAT = process.env.TEST_ADMIN_PAT;
    if (!adminPAT) {
      throw new Error("missing TEST_ADMIN_PAT");
    }

    setAdminUser(new CustomOctokit({ auth: adminPAT }));

    const { data } = await getAdminUser().rest.users.getAuthenticated();
    setAdminUsername(data.login);

    // check if the user is admin
    const { data: data1 } = await getAdminUser().rest.repos.getCollaboratorPermissionLevel({
      repo,
      owner,
      username: getAdminUsername(),
    });
    if (data1.permission !== "admin") {
      throw new Error("TEST_ADMIN_PAT is not admin");
    }

    const outsideCollaboratorPAT = process.env.TEST_OUTSIDE_COLLABORATOR_PAT;
    if (!outsideCollaboratorPAT) {
      throw new Error("missing TEST_OUTSIDE_COLLABORATOR_PAT");
    }

    setCollaboratorUser(new CustomOctokit({ auth: outsideCollaboratorPAT }));

    const { data: data2 } = await getCollaboratorUser().rest.users.getAuthenticated();
    setCollaboratorUsername(data2.login);

    // check if the user is outside collaborator
    const { data: data3 } = await getAdminUser().rest.repos.getCollaboratorPermissionLevel({
      repo,
      owner,
      username: getCollaboratorUsername(),
    });
    if (data3.permission === "admin" || data3.permission === "write") {
      throw new Error("TEST_OUTSIDE_COLLABORATOR_PAT is not outside collaborator");
    }
    if (data3.permission !== "read") {
      throw new Error("TEST_OUTSIDE_COLLABORATOR_PAT does not have read access");
    }

    setServer(
      await run(function main(app: Probot) {
        const allowedEvents = Object.values(GithubEvent) as EmitterWebhookEventName[];
        app.on(allowedEvents, async (context) => {
          await bindEvents(context);
          webhookEventEmitter.emit("event", context.payload);
        });
      })
    );

    await updateConfig(getAdminUser(), owner, "ubiquibot-config", ".github/ubiquibot-config.yml", orgConfig);
    await waitForNWebhooks(1);
    await updateConfig(getAdminUser(), owner, repo, ".github/ubiquibot-config.yml", repoConfig);
    await waitForNWebhooks(1);
  };
}
