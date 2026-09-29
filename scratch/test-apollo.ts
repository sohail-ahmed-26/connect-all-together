

async function testApollo() {
  const API_KEY = "bN-QHd7K4_uVI71yykxQWg";
  
  const payload = {
    person_titles: ["CTO", "VP of Engineering"],
    organization_num_employees_ranges: ["11,50"],
    q_organization_keyword_tags: ["Technology"],
    page: 1,
    per_page: 5
  };

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_companies/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Apollo API error:", error);
  }
}

testApollo();
