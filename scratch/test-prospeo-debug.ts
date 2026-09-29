// Drill into company_keywords result — data structure is unclear

const API_KEY = "pk_e78c29a8f5dbbe39e5ac95ae207a1fefb6d0499cfe52b694f83d6b59114997d5";

async function call(label: string, payload: object) {
  console.log(`\n\n===== ${label} =====`);
  const res = await fetch("https://api.prospeo.io/search-person", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  console.log("Raw response:", JSON.stringify(data, null, 2).slice(0, 2000));
}

async function run() {
  // The company_keywords filter returned "N/A" results - inspect the full payload
  await call("Company keywords technology - full response", {
    filters: { company_keywords: { include: ["technology"] } },
    page: 1,
  });

  // Try linkedin_url filter which Prospeo definitely supports
  await call("LinkedIn URL search", {
    filters: { company_linkedin_url: { value: "linkedin.com/company/microsoft" } },
    page: 1,
  });

  // Try with person_name filter
  await call("Person name filter", {
    filters: { person_name: { value: "John" } },
    page: 1,
  });
}

run().catch(console.error);
