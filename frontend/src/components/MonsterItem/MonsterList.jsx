import { useState } from 'react'


import MonsterItem from './MonsterItem.jsx'

function MonsterList({ monsters }) {

    return (
        
        <div className="my-2 p-2 flex flex-col gap-4">

            {monsters.map((monster, index) => (
                <MonsterItem key={index} monster={monster} />
            ))}

        </div>
    );
}

export default MonsterList

