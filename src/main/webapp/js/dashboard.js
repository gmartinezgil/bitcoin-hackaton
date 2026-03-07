let chartInstance = null;
let normalizedData = [];

// 1. Fetch data from the Java Backend
async function initDashboard() {
    try {
        const response = await fetch('/api/dashboard-data');
        if (!response.ok) throw new Error("Network response was not ok");

        const rawData = await response.json();
        processData(rawData);

        document.getElementById('loading').style.display = 'none';
        document.getElementById('timeSlider').disabled = false;

        // Initial render at index 0 (oldest data)
        renderChart(0);

    } catch (error) {
        document.getElementById('loading').innerText = "Error loading data: " + error.message;
        console.error("Dashboard Error:", error);
    }
}

// 1. Normalize, Align, and Sort Heterogeneous Data
function processData(data) {
    // Note: Assuming 'profuturo' or 'sb pensiones promedio ponderado' depending on your JSON
    const aforeSeries = data.afores["profuturo"];
    const cetesSeries = data.cetes.bmx.series[0].datos;
    const exchangeSeries = data.exchange.bmx.series[0].datos;
    const btcSeries = data.btc;

    // A dictionary to group our disparate data by a unified 'YYYY-MM' key
    const monthlyAlignment = {};

    // Helper: Format Binance Unix timestamp to 'YYYY-MM'
    const getBtcMonth = (timestamp) => {
        const d = new Date(timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Helper: Format Banxico 'dd/MM/yyyy' to 'YYYY-MM'
    const getBanxicoMonth = (dateStr) => {
        const parts = dateStr.split('/');
        return `${parts[2]}-${parts[1]}`;
    };

    // Step A: Populate the dictionary using Binance as the baseline (starts 2021)
    btcSeries.forEach(b => {
        const month = getBtcMonth(b[0]);
        monthlyAlignment[month] = { btcPriceUsd: parseFloat(b[4]) };
    });

    // Step B: Inject AFORE data where the month matches
    aforeSeries.forEach(aPoint => {
        const month = aPoint.date.substring(0, 7);
        if (monthlyAlignment[month]) {
            monthlyAlignment[month].aforeReturn = parseFloat(aPoint.amount);
        }
    });

    // Step C: Inject CETES (Since it's weekly, the loop will naturally keep the latest rate of the month)
    cetesSeries.forEach(cPoint => {
        const month = getBanxicoMonth(cPoint.fecha);
        if (monthlyAlignment[month]) {
            monthlyAlignment[month].cetesRate = parseFloat(cPoint.dato);
        }
    });

    // Step D: Inject Exchange Rate
    exchangeSeries.forEach(ePoint => {
        const month = getBanxicoMonth(ePoint.fecha);
        if (monthlyAlignment[month]) {
            monthlyAlignment[month].exchangeRate = parseFloat(ePoint.dato);
        }
    });

    // Step E: Filter out incomplete months, calculate MXN, and push to final array
    normalizedData = [];
    for (const monthKey in monthlyAlignment) {
        const dataPoint = monthlyAlignment[monthKey];

        // Only include months where ALL assets have data
        if (dataPoint.btcPriceUsd && dataPoint.aforeReturn &&
            dataPoint.cetesRate && dataPoint.exchangeRate) {

            dataPoint.month = monthKey;
            dataPoint.btcPriceMxn = dataPoint.btcPriceUsd * dataPoint.exchangeRate; // The Magic Formula
            normalizedData.push(dataPoint);
        }
    }

    // Step F: Sort chronologically to prevent looping chart lines
    normalizedData.sort((a, b) => a.month.localeCompare(b.month));
}

// 3. Render the Chart based on slider position
function renderChart(startIndex) {
    const slicedData = normalizedData.slice(startIndex);
    if (slicedData.length === 0) return;

    const labels = slicedData.map(d => d.month);

    // NEW: Dynamically grab the amount the user typed in the box
    const userInput = document.getElementById('monthlyInvestment').value;
    // Fallback to 1000 if they delete everything in the box to avoid math errors
    const monthlyContributionMxn = parseFloat(userInput) || 1000;

    const aforeGrowth = [];
    const cetesGrowth = [];
    const btcPortfolioValue = [];
    const exchangeRates = [];

    // Running totals
    let totalAforeBalance = 0;
    let totalCetesBalance = 0;
    let accumulatedBtcAmount = 0; // The actual fraction of a coin you own

    slicedData.forEach((point) => {
        exchangeRates.push(point.exchangeRate);

        // 1. AFORE & CETES DCA Math
        // Add the $1,000 contribution, then apply that month's interest rate
        totalAforeBalance = (totalAforeBalance + monthlyContributionMxn) * (1 + (point.aforeReturn / 100) / 12);
        totalCetesBalance = (totalCetesBalance + monthlyContributionMxn) * (1 + (point.cetesRate / 100) / 12);

        aforeGrowth.push(totalAforeBalance);
        cetesGrowth.push(totalCetesBalance);

        // 2. Bitcoin DCA Math
        // Calculate how much fraction of a Bitcoin $1,000 MXN buys this month
        const btcBoughtThisMonth = monthlyContributionMxn / point.btcPriceMxn;
        accumulatedBtcAmount += btcBoughtThisMonth;

        // Calculate the total MXN value of your entire Bitcoin stash at this month's price
        const currentBtcPortfolioValueMxn = accumulatedBtcAmount * point.btcPriceMxn;
        btcPortfolioValue.push(currentBtcPortfolioValueMxn);
    });

    // Pass the DCA arrays into the canvas
    updateCanvas(labels, aforeGrowth, cetesGrowth, btcPortfolioValue, exchangeRates, slicedData);

    document.getElementById('dateLabel').innerHTML = `<strong>Start Date:</strong> ${labels[0]}`;
}

// 4. Chart.js Implementation with Secondary Y-Axis
function updateCanvas(labels, aforeData, cetesData, btcData, exchangeData, rawDataReference) {
    const ctx = document.getElementById('investmentChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Bitcoin Growth (Indexed)',
                    data: btcData,
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243, 156, 18, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    yAxisID: 'y' // Maps to the left axis
                },
                {
                    label: 'CETES 28d Compounded',
                    data: cetesData,
                    borderColor: '#27ae60',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'AFORE',
                    data: aforeData,
                    borderColor: '#2980b9',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'USD/MXN Exchange Rate',
                    data: exchangeData,
                    borderColor: '#8e44ad', // A distinct purple
                    borderDash: [5, 5], // Makes it a dashed line to differentiate from investments
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y1', // NEW: Maps to the right axis
                    pointRadius: 0 // Hides the dots to keep the chart clean
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            // Format exchange rate differently than indexed points
                            if (context.datasetIndex === 3) {
                                label += '$' + context.parsed.y.toFixed(2) + ' MXN';
                            } else {
                                label += context.parsed.y.toFixed(2) + ' pts';
                            }
                            return label;
                        },
                        afterLabel: function(context) {
                            if (context.datasetIndex === 0) {
                                const index = context.dataIndex;
                                const specificMonthData = rawDataReference[index];

                                const mxnPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(specificMonthData.btcPriceMxn);
                                const usdPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(specificMonthData.btcPriceUsd);

                                return [
                                    `→ Actual Price: ${mxnPrice}`,
                                    `→ USD Price: ${usdPrice}`
                                ];
                            }
                            return null;
                        }
                    }
                }
            },
             scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Total Portfolio Value (MXN)' }, // <-- UPDATE THIS
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString(); // Adds commas to the axis numbers
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'USD/MXN Exchange Rate' },
                    grid: {
                        drawOnChartArea: false, // Prevents right-axis grid lines from overlapping left-axis lines
                    }
                }
            }
        }
    });
}

// Slider Event Listener
document.getElementById('timeSlider').addEventListener('input', (e) => {
    // Convert 0-100 range to actual array index
    const maxIndex = normalizedData.length - 2; // Keep at least 2 data points visible
    const calculatedIndex = Math.floor((e.target.value / 100) * maxIndex);
    renderChart(calculatedIndex);
});
// NEW: Listen for changes on the custom investment input
document.getElementById('monthlyInvestment').addEventListener('input', () => {
    // Re-calculate the current index based on where the slider currently is
    const sliderValue = document.getElementById('timeSlider').value;
    const maxIndex = normalizedData.length - 2;
    const calculatedIndex = Math.floor((sliderValue / 100) * maxIndex);

    // Redraw the chart with the new investment amount
    renderChart(calculatedIndex);
});

// Start the app
initDashboard();