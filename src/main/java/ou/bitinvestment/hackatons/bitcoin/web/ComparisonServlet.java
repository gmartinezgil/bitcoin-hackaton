package ou.bitinvestment.hackatons.bitcoin.web;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@WebServlet("/api/dashboard-data")
public class ComparisonServlet extends HttpServlet {

    private InvestmentDataService dataService;

    @Override
    public void init() throws ServletException {
        // Ideally, load this token from a config.properties file instead of hardcoding
        String banxicoToken = "619cfa170e4ec1dcdfcf18f10dba3a1733454c67bc4e4a9b399a5d031f897ec6";
        this.dataService = new InvestmentDataService(banxicoToken);
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");

        try {
            // 1. Fetch Banxico Data (Returns JSON Strings)
            String cetesJsonString = dataService.fetchBanxicoSeries("SF60633");
            String exchangeJsonString = dataService.fetchBanxicoSeries("SF43718");

            // 2. Fetch Bitcoin Data (Returns JSON String)
            String btcJsonString = dataService.fetchBitcoinData();

            // 3. Process Local AFORE CSV (Returns Java Map)
            String csvPath = getServletContext().getRealPath("/WEB-INF/data/afores_history.csv");
            var aforesMap = dataService.parseAforesCSV(csvPath);

            // 4. Construct the Master JSON Response using Gson
            Gson gson = new Gson();
            JsonObject masterResponse = new JsonObject();

            // Parse strings directly into the JSON tree to avoid escaping issues
            masterResponse.add("cetes", JsonParser.parseString(cetesJsonString));
            masterResponse.add("exchange", JsonParser.parseString(exchangeJsonString));
            masterResponse.add("btc", JsonParser.parseString(btcJsonString));

            // Convert the Java Map into a JSON element
            masterResponse.add("afores", gson.toJsonTree(aforesMap));

            // 5. Send to the frontend
            response.getWriter().write(gson.toJson(masterResponse));

        } catch (Exception e) {
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            JsonObject errorObj = new JsonObject();
            errorObj.addProperty("error", "Failed to compile dashboard data: " + e.getMessage());
            response.getWriter().write(errorObj.toString());
            e.printStackTrace();
        }
    }
}