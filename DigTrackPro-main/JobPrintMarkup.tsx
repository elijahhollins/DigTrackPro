import React, { useState } from 'react';

const JobPrintMarkup = () => {
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 }); // Updated scale from 0.1 to 1

    const handleWheel = (event) => {
        const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(transform.scale * scaleFactor, 0.1), 5); // Updated min scale from 0.005 to 0.1 and max scale from 40 to 5
        setTransform({ ...transform, scale: newScale });
    };

    return <div onWheel={handleWheel}>Job Print Markup Component</div>;
};

export default JobPrintMarkup;