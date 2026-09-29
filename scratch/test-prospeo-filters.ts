// Test Prospeo API with different filter strategies

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
  if (data.error) {
    console.log("Error:", data.error_code, data.filter_error || "");
  } else {
    const count = Array.isArray(data.data) ? data.data.length : "N/A";
    console.log(`Success! ${count} results`);
    if (count > 0) {
      console.log("First result:", JSON.stringify(data.data[0], null, 2));
    }
  }
}

async function run() {
  // Test 1: just page, no filters
  await call("No filters (bare page)", { page: 1 });

  // Test 2: job_title filter only
  await call("Job title = Marketing Manager", {
    filters: { person_job_title: { value: "Marketing Manager" } },
    page: 1,
  });

  // Test 3: industry keyword
  await call("Company keyword = technology", {
    filters: { company_keywords: { include: ["technology"] } },
    page: 1,
  });

  // Test 4: try country filter
  await call("Country = US", {
    filters: { person_location_country: { value: "US" } },
    page: 1,
  });

  // Test 5: minimal - just company_industry
  await call("Company industry = SaaS", {
    filters: { company_industry: { value: "SaaS" } },
    page: 1,
  });
}

run().catch(console.error);
