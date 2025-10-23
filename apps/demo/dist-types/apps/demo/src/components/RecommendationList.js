import { jsx as _jsx } from "react/jsx-runtime";
export const RecommendationList = ({ recommendations, renderItem }) => {
    if (recommendations.length === 0) {
        return _jsx("p", { children: "No recommendations generated yet." });
    }
    return (_jsx("div", { children: recommendations.map(rec => (_jsx("div", { children: renderItem(rec) }, rec.indicator.id))) }));
};
