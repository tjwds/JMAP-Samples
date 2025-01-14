#!/usr/bin/env node

const fetch = require("node-fetch");

// bail if we don't have our ENV set:
if (!process.env.JMAP_USERNAME || !process.env.JMAP_PASSWORD) {
  console.log("Please set your JMAP_USERNAME and JMAP_PASSWORD");
  console.log(
    "JMAP_USERNAME=username JMAP_PASSWORD=password node top-ten.js"
  );

  process.exit(1);
}

const hostname = process.env.JMAP_HOSTNAME || "jmap.fastmail.com";
const username = process.env.JMAP_USERNAME;
const password = process.env.JMAP_PASSWORD;

const auth_url = `https://${hostname}/.well-known/jmap`;
const auth_token = Buffer.from(`${username}:${password}`).toString("base64");

const getSession = async () => {
  const response = await fetch(auth_url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `basic ${auth_token}`
    }
  });
  return response.json();
};

const inboxIdQuery = async (api_url, account_id) => {
  const response = await fetch(api_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `basic ${auth_token}`
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Mailbox/query",
          {
            accountId: account_id,
            filter: { role: "inbox", "hasAnyRole": true },
          },
          "a"
        ],
      ]
    })
  });

  const data = await response.json();

  inbox_id = data["methodResponses"][0][1]["ids"][0];

  if (!inbox_id.length) {
    console.error("Could not get an inbox.");
    process.exit(1);
  }

  return await inbox_id;
};

const mailboxQuery = async (api_url, account_id, inbox_id) => {
  const response = await fetch(api_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `basic ${auth_token}`
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Email/query",
          {
            accountId: account_id,
            filter: { inMailbox: inbox_id },
            sort: [{ property: "receivedAt", isAscending: false }],
            limit: 10
          },
          "a"
        ],
        [
          "Email/get",
          {
            accountId: account_id,
            properties: ["id", "subject", "receivedAt"],
            "#ids": {
              resultOf: "a",
              name: "Email/query",
              path: "/ids/*"
            }
          },
          "b"
        ]
      ]
    })
  });

  const data = await response.json();

  return await data;
};

getSession().then(session => {
  const api_url = session.apiUrl;
  const account_id = session.primaryAccounts["urn:ietf:params:jmap:mail"];
  inboxIdQuery(api_url, account_id).then(inbox_id => {
    mailboxQuery(api_url, account_id, inbox_id).then(emails => {
      emails["methodResponses"][1][1]["list"].forEach(email => {
        console.log(`${email.receivedAt} — ${email.subject}`);
      });
    });
  })
});
