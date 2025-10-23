import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
export const OutcomeChart = ({ series }) => {
    const data = series.flatMap(outcome => outcome.points.map(point => ({
        outcome: outcome.outcomeName,
        label: point.label,
        value: point.value
    })));
    if (data.length === 0) {
        return _jsx("p", { children: "No indicators available yet." });
    }
    return (_jsx(ResponsiveContainer, { width: "100%", height: 360, children: _jsxs(BarChart, { data: data, margin: { top: 16, right: 32, bottom: 32, left: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "label", tick: { fontSize: 12 }, interval: 0, angle: -20, textAnchor: "end", height: 80 }), _jsx(YAxis, { domain: [0, 100], tickFormatter: value => `${value}%` }), _jsx(Tooltip, { formatter: value => `${value}%` }), _jsx(Bar, { dataKey: "value", fill: "#3182CE", radius: [6, 6, 0, 0] })] }) }));
};
