/**
 * CDN Latency Benchmarker
 * 
 * This script runs performance benchmarks against the Edge Cache CDN server.
 * It measures and compares latencies under three distinct scenarios:
 *   1. Cache MISS: Querying a file for the first time (triggers network fetch to origin + database query).
 *   2. Cache HIT: Repeated requests for a cached file (served directly from CDN disk storage).
 *   3. Bloom Rejection: Instantly blocking requests for files that definitely do not exist (anti-cache-penetration).
 * 
 * Uses native Node.js fetch (Node 18+) so it requires no external npm dependencies to run.
 */

const EDGE_CACHE_URL = process.env.EDGE_CACHE_URL || "http://localhost:5001";
const CONCURRENT_REQUESTS = 100;

// Color helpers for clean terminal output
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
    bold: "\x1b[1m"
};

/**
 * Helper to compute statistical metrics for a dataset of latency numbers
 */
const calculateStats = (latencies) => {
    if (latencies.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / sorted.length;
    
    const getPercentile = (p) => {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    };

    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: avg,
        p50: getPercentile(50),
        p95: getPercentile(95),
        p99: getPercentile(99)
    };
};

/**
 * Format stats into a readable string row
 */
const formatRow = (name, stats) => {
    return `${colors.bold}${name.padEnd(20)}${colors.reset} | ` +
           `${stats.min.toFixed(2).padStart(8)} ms | ` +
           `${stats.avg.toFixed(2).padStart(8)} ms | ` +
           `${stats.p50.toFixed(2).padStart(8)} ms | ` +
           `${stats.p95.toFixed(2).padStart(8)} ms | ` +
           `${stats.p99.toFixed(2).padStart(8)} ms | ` +
           `${stats.max.toFixed(2).padStart(8)} ms`;
};

/**
 * Makes a single request and returns client-measured roundtrip latency and server-reported internal latency
 */
const makeRequest = async (url) => {
    const startTime = performance.now();
    try {
        const response = await fetch(url);
        const endTime = performance.now();
        
        const clientLatency = endTime - startTime;
        const serverLatencyHeader = response.headers.get("X-Response-Time-MS");
        const serverLatency = serverLatencyHeader ? parseFloat(serverLatencyHeader) : 0;
        
        return {
            success: response.ok || response.status === 404, // 404 is a success for Bloom Rejection tests
            clientLatency,
            serverLatency,
            status: response.headers.get("X-Cache") || "UNKNOWN"
        };
    } catch (err) {
        return { success: false, clientLatency: 0, serverLatency: 0, status: "ERROR" };
    }
};

const runBenchmark = async () => {
    console.log(`${colors.cyan}========================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}                 CDN EDGE CACHE LATENCY BENCHMARK TOOL                  ${colors.reset}`);
    console.log(`${colors.cyan}========================================================================${colors.reset}`);
    console.log(`Target CDN Edge Server : ${colors.bold}${EDGE_CACHE_URL}${colors.reset}`);
    console.log(`Concurrent Load Volume : ${colors.bold}${CONCURRENT_REQUESTS} requests${colors.reset}\n`);

    // 1. Verify Edge Cache Server is running
    console.log("Checking if Edge Cache CDN Server is online...");
    try {
        const pingRes = await fetch(`${EDGE_CACHE_URL}/files/api/stats`, { signal: AbortSignal.timeout(2000) });
        if (!pingRes.ok) throw new Error("Server returned non-ok status");
        console.log(`${colors.green}✔ CDN Server is online! Starting benchmark...${colors.reset}\n`);
    } catch (err) {
        console.error(`${colors.red}❌ Error: Unable to connect to the CDN Server at ${EDGE_CACHE_URL}.${colors.reset}`);
        console.log(`Please make sure your containers are active by running:`);
        console.log(`  ${colors.bold}docker compose up -d${colors.reset}\n`);
        process.exit(1);
    }

    // 2. Prepare and seed the test asset
    const filename = `benchmark_test_${Date.now()}.txt`;
    console.log(`Seeding test asset: ${colors.bold}${filename}${colors.reset}...`);
    try {
        const formData = new FormData();
        const dummyContent = "This is a dummy asset file used to benchmark edge cache and Bloom Filter speeds.";
        formData.append("file", new Blob([dummyContent], { type: "text/plain" }), filename);

        const uploadRes = await fetch(`${EDGE_CACHE_URL}/files/api/upload`, {
            method: "POST",
            body: formData
        });
        if (!uploadRes.ok) throw new Error("Failed to seed file");
        console.log(`${colors.green}✔ Seeding complete!${colors.reset}\n`);
    } catch (err) {
        console.error(`${colors.red}❌ Error: Failed to upload benchmark test asset to Origin server.${colors.reset}`);
        console.error(err.message);
        process.exit(1);
    }

    // 3. Test Cache MISS
    console.log("Running Cache MISS test (First request - fetching from Origin)...");
    const missResult = await makeRequest(`${EDGE_CACHE_URL}/files/${filename}`);
    if (!missResult.success || missResult.status !== "MISS") {
        console.warn(`${colors.yellow}⚠ Warning: Cache Miss test did not return expected status. Got X-Cache: ${missResult.status}${colors.reset}`);
    }

    // 4. Test Cache HITS
    console.log(`Firing ${CONCURRENT_REQUESTS} concurrent requests for Cache HITS...`);
    const hitPromises = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        hitPromises.push(makeRequest(`${EDGE_CACHE_URL}/files/${filename}`));
    }
    const hitResults = await Promise.all(hitPromises);

    // 5. Test Bloom Filter Rejections
    console.log(`Firing ${CONCURRENT_REQUESTS} concurrent requests for nonexistent files (Bloom Rejections)...`);
    const rejectPromises = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        const fakeFilename = `nonexistent_file_${i}_${Date.now()}.txt`;
        rejectPromises.push(makeRequest(`${EDGE_CACHE_URL}/files/${fakeFilename}`));
    }
    const rejectResults = await Promise.all(rejectPromises);

    // 6. Gather Latency Metrics
    const hitClientLatencies = hitResults.filter(r => r.success).map(r => r.clientLatency);
    const hitServerLatencies = hitResults.filter(r => r.success).map(r => r.serverLatency);
    
    const rejectClientLatencies = rejectResults.filter(r => r.success).map(r => r.clientLatency);
    const rejectServerLatencies = rejectResults.filter(r => r.success).map(r => r.serverLatency);

    const hitClientStats = calculateStats(hitClientLatencies);
    const hitServerStats = calculateStats(hitServerLatencies);
    
    const rejectClientStats = calculateStats(rejectClientLatencies);
    const rejectServerStats = calculateStats(rejectServerLatencies);

    // 7. Output Results
    console.log(`\n${colors.cyan}========================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}                           BENCHMARK RESULTS                            ${colors.reset}`);
    console.log(`${colors.cyan}========================================================================${colors.reset}`);
    console.log(`Single Cache MISS Latency : Client: ${colors.bold}${missResult.clientLatency.toFixed(2)} ms${colors.reset} | Server internal: ${colors.bold}${missResult.serverLatency.toFixed(2)} ms${colors.reset}\n`);

    const header = `${"Scenario".padEnd(20)} | ${"Min".padStart(8)}    | ${"Avg".padStart(8)}    | ${"p50 (Med)".padStart(9)} | ${"p95".padStart(8)}    | ${"p99".padStart(8)}    | ${"Max".padStart(8)}`;
    const separator = "-".repeat(header.length);

    console.log(colors.magenta + colors.bold + "CLIENT-SIDE ROUNDTRIP LATENCY (Includes Network Hop Overhead):" + colors.reset);
    console.log(separator);
    console.log(header);
    console.log(separator);
    console.log(formatRow("Cache HIT (Disk)", hitClientStats));
    console.log(formatRow("Bloom Reject (Guard)", rejectClientStats));
    console.log(separator);

    console.log(`\n${colors.magenta}${colors.bold}SERVER-SIDE INTERNAL PROCESSING LATENCY (Pure Server Execution Time):${colors.reset}`);
    console.log(separator);
    console.log(header);
    console.log(separator);
    console.log(formatRow("Cache HIT (Disk)", hitServerStats));
    console.log(formatRow("Bloom Reject (Guard)", rejectServerStats));
    console.log(separator);

    console.log(`\n${colors.yellow}${colors.bold}Key Performance Takeaways:${colors.reset}`);
    console.log(`1. ${colors.bold}Bloom Filter Speed${colors.reset}: Non-existent file requests are blocked in ${colors.green}${rejectServerStats.avg.toFixed(2)} ms${colors.reset} (server time), protecting origin servers.`);
    console.log(`2. ${colors.bold}Cache Speedup${colors.reset}: Disk Cache HITS process in ${colors.green}${hitServerStats.avg.toFixed(2)} ms${colors.reset} vs Cache MISS origin lookup which took ${colors.yellow}${missResult.serverLatency.toFixed(2)} ms${colors.reset}.`);
    console.log(`3. ${colors.bold}Network Overhead${colors.reset}: Compare Client-side vs Server-side latency to see the network virtualization delay.\n`);
};

runBenchmark();
