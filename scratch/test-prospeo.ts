

async function testProspeo() {
  const API_KEY = "pk_e78c29a8f5dbbe39e5ac95ae207a1fefb6d0499cfe52b694f83d6b59114997d5";
  
  const payload = {
    filters: {
      person_job_title: {
        value: "CEO"
      }
    },
    page: 1
  };

  try {
    const res = await fetch("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": API_KEY // Prospeo usually uses X-KEY or Authorization. The docs didn't specify exactly here, I'll try X-KEY. Wait, I should try both.
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Prospeo API error:", error);
  }
}

testProspeo();
