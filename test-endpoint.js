const axios = require('axios');

async function testEndpoint() {
    try {
        const response = await axios.get('https://tasha-vps-backend-2.onrender.com/api/admin/financial-metrics');
        console.log("Endpoint response:", JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("Endpoint test failed:", err.message);
        if (err.response) {
            console.error("Response data:", err.response.data);
        }
    }
}

testEndpoint();
