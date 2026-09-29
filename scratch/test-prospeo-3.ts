async function testProspeo() {
  const API_KEY = "pk_e78c29a8f5dbbe39e5ac95ae207a1fefb6d0499cfe52b694f83d6b59114997d5";
  
  const payload = {
    filters: {
      person_job_title: {
        value: "software engineer"
      },
      company_keywords: {
        include: ["technology"]
      }
    },
    page: 1
  };

  console.log(`Testing with payload:`, JSON.stringify(payload, null, 2));
  try {
    const res = await fetch("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": API_KEY
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(`Fetch failed:`, e);
  }
}

testProspeo();
