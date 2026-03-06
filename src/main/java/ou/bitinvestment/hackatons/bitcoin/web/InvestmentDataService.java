package ou.bitinvestment.hackatons.bitcoin.web;

import javax.net.ssl.SSLContext;
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class InvestmentDataService {

    private final String bmxToken;

    public InvestmentDataService(String bmxToken) {
        this.bmxToken = bmxToken;
    }

    // --- INNER CLASS FOR CSV DATA ---
    public static class DataPoint {
        public String date;
        public double amount;

        public DataPoint(String date, double amount) {
            this.date = date;
            this.amount = amount;
        }

        @Override
        public String toString() {
            return "DataPoint{" +
                    "date='" + date + '\'' +
                    ", amount=" + amount +
                    '}';
        }
    }

    // --- 1. BANXICO API MATCHER (TLS 1.3) ---
    public String fetchBanxicoSeries(String seriesId) throws Exception {
        SSLContext sc = SSLContext.getInstance("TLSv1.3");
        sc.init(null, null, null);

        String urlString = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/" + seriesId + "/datos";
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();

        conn.setRequestMethod("GET");
        conn.setRequestProperty("Bmx-Token", this.bmxToken);
        conn.setRequestProperty("Accept", "application/json");

        if (conn.getResponseCode() != 200) {
            throw new RuntimeException("Banxico API Error: " + conn.getResponseCode());
        }

        try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            System.out.println("BANXICO DATA = " + sb);
            return sb.toString();
        }
    }

    // --- 2. AFORE CSV PARSER ---
    public Map<String, List<DataPoint>> parseAforesCSV(String filePath) {
        Map<String, List<DataPoint>> aforesData = new HashMap<>();

        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            String line;
            boolean isFirstLine = true;

            while ((line = br.readLine()) != null) {
                if (isFirstLine) {
                    isFirstLine = false;
                    continue; // Skip header
                }

                String[] columns = line.split(",");
                if (columns.length == 5) {
                    String date = columns[0].trim();
                    String aforeName = columns[3].trim();
                    double amount = Double.parseDouble(columns[4].trim());

                    aforesData.putIfAbsent(aforeName, new ArrayList<>());
                    aforesData.get(aforeName).add(new DataPoint(date, amount));
                }
            }
        } catch (Exception e) {
            System.err.println("Error parsing CSV: " + e.getMessage());
        }
        System.out.println("AFORE DATA");
        for (Map.Entry<String, List<InvestmentDataService.DataPoint>> entry : aforesData.entrySet()) {
            System.out.println(entry.getKey() + ":" + entry.getValue().toString());
        }
        return aforesData;
    }

    // --- 3. BITCOIN API MATCHER ---
//    public String fetchBitcoinData() throws Exception {
//        // Fetches monthly historical data for the last ~5 years from CoinGecko
//        String urlString = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1825&interval=monthly";
//        URL url = new URL(urlString);
//        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
//        conn.setRequestMethod("GET");
//        conn.setRequestProperty("Accept", "application/json");
//        // Add a fake user agent as some crypto APIs block default Java agents
//        conn.setRequestProperty("User-Agent", "Mozilla/5.0");
//
//        try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
//            StringBuilder sb = new StringBuilder();
//            String line;
//            while ((line = br.readLine()) != null) sb.append(line);
//            return sb.toString();
//        }
//    }
    // --- 3. BITCOIN API MATCHER (Updated to Binance) ---
    public String fetchBitcoinData() throws Exception {
        // Binance API for monthly candlesticks (klines). 60 months = 5 years.
        String urlString = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1M&limit=60";
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();

        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");

        if (conn.getResponseCode() != 200) {
            throw new RuntimeException("Binance API Error: " + conn.getResponseCode());
        }

        try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            System.out.println("BINANCE DATA = " + sb);
            return sb.toString();
        }
    }

}