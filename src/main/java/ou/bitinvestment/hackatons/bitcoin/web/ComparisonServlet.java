package ou.bitinvestment.hackatons.bitcoin.web;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

@WebServlet(loadOnStartup = 1, urlPatterns = "/api/dashboard-data")
public class ComparisonServlet extends HttpServlet {

    private InvestmentDataService dataService;

    // Our Caching Variables
    private String cachedJsonResponse = null;
    private Instant lastFetchTime = null;
    private final int CACHE_TTL_HOURS = 24; // Time To Live

    @Override
    public void init() throws ServletException {
        // Ideally, load this token from a config.properties file instead of hardcoding
        String banxicoToken = "619cfa170e4ec1dcdfcf18f10dba3a1733454c67bc4e4a9b399a5d031f897ec6";
        this.dataService = new InvestmentDataService(banxicoToken);

        // Fetch the data immediately when the server starts!
        System.out.println("Server booting: Warming up the financial data cache...");
        refreshCache();
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");

        // Check if the cache has expired (older than 24 hours)
        if (cachedJsonResponse == null || Instant.now().isAfter(lastFetchTime.plus(CACHE_TTL_HOURS, ChronoUnit.HOURS))) {
            System.out.println("Cache expired or empty. Fetching fresh data...");
            boolean success = refreshCache();

            // If the APIs are down and refresh fails, we keep using the old cache!
            if (!success && cachedJsonResponse == null) {
                response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
                response.getWriter().write("{\"error\": \"APIs unreachable and no local cache available.\"}");
                return;
            }
        }

        // Serve the data directly from RAM. This takes < 2ms.
        response.getWriter().write(cachedJsonResponse);

//        try {
//            // 1. Fetch Banxico Data (Returns JSON Strings)
//            String cetesJsonString = dataService.fetchBanxicoSeries("SF60633");
//            String exchangeJsonString = dataService.fetchBanxicoSeries("SF43718");
//
//            // 2. Fetch Bitcoin Data (Returns JSON String)
//            String btcJsonString = dataService.fetchBitcoinData();
//
//            // 3. Process Local AFORE CSV (Returns Java Map)
//            String csvPath = getServletContext().getRealPath("/WEB-INF/data/afores_history.csv");
//            var aforesMap = dataService.parseAforesCSV(csvPath);
//
//            // 4. Construct the Master JSON Response using Gson
//            Gson gson = new Gson();
//            JsonObject masterResponse = new JsonObject();
//
//            // Parse strings directly into the JSON tree to avoid escaping issues
//            masterResponse.add("cetes", JsonParser.parseString(cetesJsonString));
//            masterResponse.add("exchange", JsonParser.parseString(exchangeJsonString));
//            masterResponse.add("btc", JsonParser.parseString(btcJsonString));
//
//            // Convert the Java Map into a JSON element
//            masterResponse.add("afores", gson.toJsonTree(aforesMap));
//
//            // 5. Send to the frontend
//            response.getWriter().write(gson.toJson(masterResponse));
//
//        } catch (Exception e) {
//            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
//            JsonObject errorObj = new JsonObject();
//            errorObj.addProperty("error", "Failed to compile dashboard data: " + e.getMessage());
//            response.getWriter().write(errorObj.toString());
//            e.printStackTrace();
//        }
    }

    private synchronized boolean refreshCache() {
        try {
            // 1. Fetch live data
            String cetesJsonString = dataService.fetchBanxicoSeries("SF60633");
            String exchangeJsonString = dataService.fetchBanxicoSeries("SF43718");
            String btcJsonString = dataService.fetchBitcoinData();

            String csvPath = getServletContext().getRealPath("/WEB-INF/data/afores_history.csv");
            var aforesMap = dataService.parseAforesCSV(csvPath);

            // 2. Compile into a single JSON Tree
            Gson gson = new Gson();
            JsonObject masterResponse = new JsonObject();
            masterResponse.add("cetes", JsonParser.parseString(cetesJsonString));
            masterResponse.add("exchange", JsonParser.parseString(exchangeJsonString));
            masterResponse.add("btc", JsonParser.parseString(btcJsonString));
            masterResponse.add("afores", gson.toJsonTree(aforesMap));

            // 3. Update the RAM Cache
            this.cachedJsonResponse = gson.toJson(masterResponse);
            this.lastFetchTime = Instant.now();

            // 4. Save to Disk (The Vault Backup)
            saveCacheToDisk(this.cachedJsonResponse);

            return true;

        } catch (Exception e) {
            System.err.println("Live fetch failed! Attempting to load from disk backup...");
            return loadCacheFromDisk(); // Fallback to the last known good state
        }
    }

    private void saveCacheToDisk(String json) {
        try {
            String backupPath = getServletContext().getRealPath("/WEB-INF/data/vault_backup.json");
            if (backupPath != null) {
                Files.writeString(Paths.get(backupPath), json);
            }
        } catch (IOException e) {
            System.err.println("Could not write backup to disk: " + e.getMessage());
        }
    }

    private boolean loadCacheFromDisk() {
        try {
            String backupPath = getServletContext().getRealPath("/WEB-INF/data/vault_backup.json");
            if (backupPath != null && new File(backupPath).exists()) {
                this.cachedJsonResponse = Files.readString(Paths.get(backupPath));
                this.lastFetchTime = Instant.now(); // Reset timer so it doesn't instantly retry
                return true;
            }
        } catch (IOException e) {
            System.err.println("Disk backup missing or corrupted.");
        }
        return false;
    }
}