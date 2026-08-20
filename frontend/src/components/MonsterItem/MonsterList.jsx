import { useState } from 'react'


import MonsterItem from './MonsterItem.jsx'

function MonsterList({ monsters }) {
    const [monsterList, setMonsterList] = useState(monsters)


    return (
        <div className="my-2 p-1 grid grid-cols-2 gap-2">

            {monsterList.map((monster, index) => (
                <MonsterItem key={index} monster={monster} />
            ))}

        </div>
    );
}

export default MonsterList

