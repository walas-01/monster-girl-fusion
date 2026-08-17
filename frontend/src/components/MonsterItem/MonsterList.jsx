import { useState } from 'react'


import MonsterItem from './MonsterItem.jsx'

function MonsterList() {
    const [monsterList, setMonsterList] = useState([
        {
            id: 3,
            name: "mouse",
            display_name: "Chica Ratón",
            tier: 1,
            nickname: "DexoPapu",
            max_hp: 29,
            atk: 6,
            spd: 11,
            aim: 3,
            owner_id: 2,
            image_path: "monsters/krampus.png"
        },
        {
            id: 4,
            name: "bunny",
            display_name: "chica conejo",
            tier: 1,
            nickname: " Hoppelia",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/bunny.png"
        },
        {
            id: 4,
            name: "pig",
            display_name: "Horror Cósmico",
            tier: 5,
            nickname: "Cara de caca",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/horror.png"
        },
        {
            id: 4,
            name: "pig",
            display_name: "Mujer Cerda",
            tier: 1,
            nickname: "Gonza mi mujer",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/honey_slime.png"
        },
        {
            id: 4,
            name: "bunny",
            display_name: "chica conejo",
            tier: 1,
            nickname: " Hoppelia",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/droid.png"
        },
        {
            id: 4,
            name: "pig",
            display_name: "Horror Cósmico",
            tier: 5,
            nickname: "Cara de caca",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/bee_queen.png"
        },
        {
            id: 4,
            name: "pig",
            display_name: "Mujer Cerda",
            tier: 1,
            nickname: "Gonza mi mujer",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/banshee.png"
        },
        {
            id: 4,
            name: "bunny",
            display_name: "chica conejo",
            tier: 1,
            nickname: " Hoppelia",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/cow.png"
        },
        {
            id: 4,
            name: "pig",
            display_name: "Horror Cósmico",
            tier: 5,
            nickname: "Cara de caca",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/harpy.png"
        },
        {
            id: 4,
            name: "pig",
            display_name: "Mujer Cerda",
            tier: 1,
            nickname: "Gonza mi mujer",
            max_hp: 44,
            atk: 3,
            spd: 13,
            aim: 2,
            owner_id: 1,
            image_path: "monsters/phoenix.png"
        }
    ])





    return (
        <div className="my-2 p-1 grid grid-cols-2 gap-2">

            {monsterList.map((monster, index) => (
                <MonsterItem key={index} monster={monster} />
            ))}

        </div>
    );
}

export default MonsterList

