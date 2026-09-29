async function testProspeo() {
  const API_KEY = "pk_e78c29a8f5dbbe39e5ac95ae207a1fefb6d0499cfe52b694f83d6b59114997d5";
  
  // Let's try multiple payload variations to see which one yields results
  const payloads = [
    {
      name: "Domain + Title",
      body: {
        filters: {
          company_domain: { value: "google.com" },
          person_job_title: { value: "Engineer" }
        },
        page: 1
      }
    },
    {
      name: "Company Name + Title",
      body: {
        filters: {
          company_name: { value: "Microsoft" },
          person_job_title: { value: "Manager" }
        },
        page: 1
      }
    },
    {
      name: "Company Keywords",
      body: {
        filters: {
          company_keywords: { include: ["tech"] },
        },
        page: 1
      }
    }
  ];

  for (const p of payloads) {
    console.log(`\nTesting: ${p.name}`);
    try {
      const res = await fetch("https://api.prospeo.io/search-person", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KEY": API_KEY
        },
        body: JSON.stringify(p.body)
      });
      const data = await res.json();
      if (data.error) {
        console.log(`Error: ${JSON.stringify(data)}`);
      } else {
        console.log(`Success! Found ${data.data?.length || 0} results`);
      }
    } catch (e) {
      console.log(`Fetch failed: ${e}`);
    }
  }
}

testProspeo();
