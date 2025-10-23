import { useEffect, useMemo, useState } from "react";
import { AdaptiveEngine } from "../adaptive/adaptiveEngine";
export const useLearningPath = ({ grades, learnerProfile, options, algorithm }) => {
    const engine = useMemo(() => new AdaptiveEngine(grades, { algorithm }), [grades, algorithm]);
    const [recommendations, setRecommendations] = useState([]);
    const run = () => {
        setRecommendations(engine.getRecommendationList(learnerProfile, options));
    };
    const algorithmKey = algorithm?.id ?? "simple";
    const optionsKey = useMemo(() => JSON.stringify({
        ...(options ?? {}),
        __algorithm: algorithmKey
    }), [options, algorithmKey]);
    useEffect(() => {
        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, learnerProfile, optionsKey]);
    return {
        recommendations,
        refresh: run
    };
};
