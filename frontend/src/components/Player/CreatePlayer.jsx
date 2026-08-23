function CreatePlayer({username,setUsername,onCreate,loading}) {

    return (
        <div className="p-6 flex flex-col gap-4">

            <h1 className="text-3xl font-bold text-white">
                Bienvenido a Monster-G
            </h1>

            <p className="text-gray-300">
                Crea tu jugador para comenzar.
            </p>

            <input
                type="text"
                placeholder="Tu nombre..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="p-3 rounded-lg bg-white"
            />

            <button onClick={onCreate}disabled={loading}
                className="p-3 rounded-lg bg-indigo-500 text-white font-bold"
            >
                {loading ? "Creando..." : "Crear jugador"}
            </button>

        </div>
    );
}

export default CreatePlayer;