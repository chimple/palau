import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const getProgressColor = (value) => {
    if (value >= 0.75) {
        return "#3BA272";
    }
    if (value >= 0.5) {
        return "#F7B733";
    }
    return "#F05D5E";
};
export const IndicatorProgress = ({ recommendation }) => {
    const percent = Math.round(recommendation.mastery * 100);
    const color = getProgressColor(recommendation.mastery);
    return (_jsxs("div", { style: {
            border: "1px solid #D9D9D9",
            borderRadius: 8,
            padding: "0.75rem",
            marginBottom: "0.5rem"
        }, children: [_jsx("h3", { style: { margin: "0 0 0.5rem 0", fontSize: "1rem" }, children: recommendation.indicator.description }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem" }, children: [_jsx("div", { style: { flex: 1, height: 8, background: "#F0F0F0", borderRadius: 4 }, children: _jsx("div", { style: {
                                width: `${percent}%`,
                                height: "100%",
                                background: color,
                                borderRadius: 4
                            } }) }), _jsxs("span", { style: { fontVariantNumeric: "tabular-nums" }, children: [percent, "%"] })] }), recommendation.blockedBy.length > 0 ? (_jsxs("p", { style: { margin: "0.5rem 0 0 0", color: "#F05D5E" }, children: ["Blocked by: ", recommendation.blockedBy.join(", ")] })) : (_jsx("p", { style: { margin: "0.5rem 0 0 0", color: "#6F7D8C" }, children: recommendation.reason }))] }));
};
