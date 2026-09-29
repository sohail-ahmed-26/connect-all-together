import { auth } from "../src/lib/auth";

async function test() {
  try {
    // create a fake headers object
    const headers = new Headers();
    // try to get session (this should return null since no cookie is present, NOT throw an error)
    const session = await auth.api.getSession({ headers });
    console.log("Session:", session);
  } catch (error) {
    console.error("Error getting session:", error);
  }
}

test();
