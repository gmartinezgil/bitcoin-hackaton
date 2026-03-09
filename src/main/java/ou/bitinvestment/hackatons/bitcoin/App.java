package ou.bitinvestment.hackatons.bitcoin;

/**
 * Hello world!
 */

import org.apache.catalina.Context;
import org.apache.catalina.connector.Connector;
import org.apache.catalina.startup.Tomcat;
import ou.bitinvestment.hackatons.bitcoin.web.ComparisonServlet;

import java.io.File;

public class App {
    public static void main(String[] args) {
        try {
            // 1. Initialize Tomcat
            Tomcat tomcat = new Tomcat();
            // 2. Set the port (e.g., 8080)
            int port = 8080;
            tomcat.setPort(port);

            // Get the HTTP Connector
            Connector connector = tomcat.getConnector(); // Triggers the creation of the default HTTP connector
            // Enable GZIP Compression
            connector.setProperty("compression", "on");
            // Set the minimum file size to compress (2048 bytes = 2KB)
            // Compressing tiny files actually wastes CPU, so we only compress larger payloads
            connector.setProperty("compressionMinSize", "2048");
            // Tell Tomcat WHICH file types to compress
            // We specifically include application/json for our REST API, and standard web files
            connector.setProperty("compressableMimeType", "text/html,text/xml,text/plain,text/css,text/javascript,application/javascript,application/json");

            // 3. Define where the frontend files and WEB-INF are located
            String webappDirLocation = "src/main/webapp/";
            File webAppDir = new File(webappDirLocation);

            if (!webAppDir.exists()) {
                System.err.println("Cannot find webapp directory: " + webAppDir.getAbsolutePath());
                System.exit(1);
            }

            // Add the webapp context
            Context ctx = tomcat.addWebapp("", webAppDir.getAbsolutePath());

            // --- THE FIX: MANUALLY REGISTER THE SERVLET ---
            // 1. Give the servlet a name and instantiate it
            Tomcat.addServlet(ctx, "dashboardServlet", new ComparisonServlet());

            // 2. Map the URL endpoint to that specific servlet
            ctx.addServletMappingDecoded("/api/dashboard-data", "dashboardServlet");
            // ----------------------------------------------

            // 4. Add the webapp to Tomcat
            // The empty string "" means this will run on the root context (http://localhost:8080/)
            //tomcat.addWebapp("", webAppDir.getAbsolutePath());

            // 5. Start the server
            System.out.println("Starting embedded server on http://localhost:" + port);
            tomcat.start();

            // 6. Keep the server running until manually terminated
            tomcat.getServer().await();

        } catch (Exception e) {
            System.err.println("Failed to start Embedded Tomcat: " + e.getMessage());
            e.printStackTrace();
        }
    }
}